const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const client = new S3Client({ region: 'us-east-1' });

const options = {
  bucketName:'ivs-act-1',
  customerId:'737419903277',
  channelId:'N6vgKWQrHNjZ',
  dstArn:'arn:aws:s3:::act-player-video-archive',
  dstBucket:'act-player-video-archive',
  dstKey:'data/video/list.json',
};

const pathRegex = /^ivs\/v1\/([0-9]+)\/([a-zA-Z0-9]+)\/([0-9]{4}\/[0-9]{1,2}\/[0-9]{1,2})\/([0-9]{1,2}\/[0-9]{1,2})\/([a-zA-Z0-9]+)\/events\/recording-(started|ended)\.json$/;

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function getAllJsons(params) {
  // Declare truncated as a flag that the while loop is based on.
  let truncated = true;
  // Declare a variable to which the key of the last element is assigned to in the response.
  let pageMarker;
  // while loop that runs until 'response.truncated' is false.
  let jsons = [];
  while (truncated) {
    try {
      const response = await client.send(new ListObjectsV2Command(params));
      // return response; //For unit tests
      response.Contents.forEach((item) => {
        const matches = item.Key.match(pathRegex);
        if(matches && matches.length) {
          const [
            fullPath,
            customerId,
            channelId,
            date,
            time,
            streamId,
            state,
          ] = matches;
          jsons.push({
            fullPath,
            customerId,
            channelId,
            date,
            time,
            streamId,
            state,
          });
        }
      });
      // Log the key of every item in the response to standard output.
      truncated = response.IsTruncated;
      // If truncated is true, assign the key of the last element in the response to the pageMarker variable.
      if (truncated) {
        // Assign the pageMarker value to bucketParams so that the next iteration starts from the new pageMarker.
        params.ContinuationToken = response.NextContinuationToken;
      }
      // At end of the list, response.truncated is false, and the function exits the while loop.
    } catch (err) {
      console.log("Error", err);
      truncated = false;
    }
  }
  return jsons;
}

async function initBaseDataJson() {
  const jsons = await getAllJsons({
    Bucket: options.bucketName,
    Prefix: `ivs/v1/${options.customerId}/${options.channelId}/`,
  });

  const recordingsStarted = jsons.filter((record) => (record.state === 'started'));
  const recordingsEnded = jsons.filter((record) => (record.state === 'ended'));
  let videoList = [];
  for(let i = 0; i < recordingsStarted.length; i++) {
    const record = recordingsStarted[i];
    const ended = recordingsEnded.find((e) => (e.streamId === record.streamId));

    try {
      const recordResponse = await client.send(new GetObjectCommand({
        Bucket: options.bucketName,
        Key: ended ? ended.fullPath : record.fullPath,
      }));
      const bodyContents = await streamToString(recordResponse.Body);
      const body = JSON.parse(bodyContents);

      const hlsPath = body.media.hls.path;
      const hlsPlaylist = body.media.hls.playlist;
      const thumbnailPath = body.media.thumbnails.path;

      const playlistKey = `ivs/v1/${record.customerId}/${record.channelId}/${record.date}/${record.time}/${record.streamId}/${hlsPath}/${hlsPlaylist}`;
      const thumbnailsPath = `ivs/v1/${record.customerId}/${record.channelId}/${record.date}/${record.time}/${record.streamId}/${thumbnailPath}`;

      if(ended) {
        videoList.push({
          live: false,
          streamId: record.streamId,
          startAt: body.recording_started_at,
          endAt:  body.recording_ended_at,
          duration: body.media.hls.duration_ms,
          Bucket: options.bucketName,
          playlistKey,
          thumbnailsPath,
        })
      } else {
        videoList.push({
          live: true,
          streamId: record.streamId,
          startAt: body.recording_started_at,
          Bucket: options.bucketName,
          playlistKey,
          thumbnailsPath,
        })
      }
    } catch(e) {
      console.log(record, e);
      continue;
    }
  }

  videoList = videoList.sort((a,b) => {
    const aStart = new Date(a.startAt);
    const bStart = new Date(b.startAt);
    const aEnd = a.endAt ? new Date(a.endAt) : new Date();
    const bEnd = b.endAt ? new Date(b.endAt) : new Date();

    if(aEnd === bEnd) {
      return 0;
    }
    return aEnd > bEnd ? -1 : 1;
  });
  return videoList;
}

exports.handler = async (event, context) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // Get the object from the event and show its content type
  const bucket = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

  const matches = key.match(pathRegex);
  if(!matches) {
    return "Done";
  }
  const [
    fullPath,
    customerId,
    channelId,
    date,
    time,
    streamId,
    state,
  ] = matches;

  if(customerId !== options.customerId || channelId !== options.channelId) {
    return "Done";
  }

  try {
    const jsonListResponse = await client.send(new GetObjectCommand({
      Bucket: options.dstBucket,
      Key: options.dstKey,
    }));
    let jsons = JSON.parse(await streamToString(jsonListResponse.Body));

    const recordResponse = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }));
    const body = JSON.parse(await streamToString(recordResponse.Body));

    const hlsPath = body.media.hls.path;
    const hlsPlaylist = body.media.hls.playlist;
    const thumbnailPath = body.media.thumbnails.path;

    const playlistKey = `ivs/v1/${customerId}/${channelId}/${date}/${time}/${streamId}/${hlsPath}/${hlsPlaylist}`;
    const thumbnailsPath = `ivs/v1/${customerId}/${channelId}/${date}/${time}/${streamId}/${thumbnailPath}`;

    const jsonIndex = jsons.findIndex((json) => (json.streamId === streamId));

    const jsonUpdate = state === 'ended'
        ? {
          live: false,
          streamId: streamId,
          startAt: body.recording_started_at,
          endAt:  body.recording_ended_at,
          duration: body.media.hls.duration_ms,
          Bucket: options.bucketName,
          playlistKey,
          thumbnailsPath,
        }
        : {
          live: true,
          streamId: streamId,
          startAt: body.recording_started_at,
          Bucket: options.bucketName,
          playlistKey,
          thumbnailsPath,
        };

    if(jsonIndex === -1) {
      jsons.unshift(jsonUpdate);
    } else {
      jsons[jsonIndex] = jsonUpdate
    }

    jsons.sort((a,b) => {
      const aStart = new Date(a.startAt);
      const bStart = new Date(b.startAt);
      const aEnd = a.endAt ? new Date(a.endAt) : new Date();
      const bEnd = b.endAt ? new Date(b.endAt) : new Date();

      if(aEnd === bEnd) {
        return 0;
      }
      return aEnd > bEnd ? -1 : 1;
    });

    const putResponse = await client.send(new PutObjectCommand({
      Bucket: options.dstBucket,
      Key: options.dstKey,
      Body: JSON.stringify(jsons),
    }));
  } catch(e) {
    if(e.Code === 'NoSuchKey') {
      const jsons = await initBaseDataJson();
      const putResponse = await client.send(new PutObjectCommand({
        Bucket: options.dstBucket,
        Key: options.dstKey,
        Body: JSON.stringify(jsons),
      }));
    } else {
      return e;
    }
  }
  return "Done";
};