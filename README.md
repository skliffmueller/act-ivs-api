# Act IVS API

This is a video list generator to increase the feature set of [Act Keyboard Player](https://github.com/skliffmueller/act-keyboard-player).

[Check out the live demo](http://act-player-video-archive.s3-website-us-east-1.amazonaws.com/)

Also checkout my pairing project [act-rtmp-encoder](https://github.com/skliffmueller/act-rtmp-encoder) Which was used in generating the demo live stream above.

The project utilizes AWS Lambdas to watch for S3 bucket putObject events in an IVS s3 bucket. Then updates a json file on another s3 bucket to be used for video playback features.

The project source includes function code and supporting resources:

- `function` - A Node.js function.
- `template.yml` - An AWS CloudFormation template that creates an application.
- `1-create-bucket.sh`, `2-deploy.sh`, etc. - Shell scripts that use the AWS CLI to deploy and manage the application.

# Requirements
- Amazon IVS live channel setup
- S3 bucket for storing IVS streams
- S3 bucket for storing Act Player website [Act Keyboard Player](https://github.com/skliffmueller/act-keyboard-player)
- [Node.js 16 with npm](https://nodejs.org/en/download/releases/)
- The Bash shell. For Linux and macOS, this is included by default. In Windows 10, you can install the [Windows Subsystem for Linux](https://docs.microsoft.com/en-us/windows/wsl/install-win10) to get a Windows-integrated version of Ubuntu and Bash.
- [The AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html) v1.17 or newer.

If you use the AWS CLI v2, add the following to your [configuration file](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) (`~/.aws/config`):

```
cli_binary_format=raw-in-base64-out
```

This setting enables the AWS CLI v2 to load JSON events from a file, matching the v1 behavior.

# Setup
Download or clone this repository.

    $ git clone https://github.com/skliffmueller/act-ivs-api.git
    $ cd act-ivs-api

Update `options` variable in `function/index.js` with your parameters:
```
const options = {
  bucketName:'ivs-act-1',
  customerId:'737419903277',
  channelId:'N6vgKWQrHNjZ',
  dstArn:'arn:aws:s3:::act-player-video-archive',
  dstBucket:'act-player-video-archive',
  dstKey:'data/video/list.json',
};
```

`bucketName` is the bucket used to store the ivs playback streams
`customerId` is the customer id of the IVS channel
`channelId` is the channel id of the IVS channel

If the data will be used for Act Player, the bucket must be the root of the act player website statics. Act Player expects the data to be at `data/video/list.json` relative to itself.

`dstArn` is the bucket arn to store the list.json file after processing
`dstBucket` is the bucket name to store the list.json file after processing
`dstKey` is the file name (or location) of where the file will be generated

To create a new bucket for deployment artifacts, run `1-create-bucket.sh`.

    blank-nodejs$ ./1-create-bucket.sh
    make_bucket: lambda-artifacts-a5e491dbb5b22e0d

To build a Lambda layer that contains the function's runtime dependencies, run `2-build-layer.sh`. Packaging dependencies in a layer reduces the size of the deployment package that you upload when you modify your code.

    blank-nodejs$ ./2-build-layer.sh

# Deploy

It might be good to update the parameters in the template, you can do this in the cli, by updating `3-deply.sh` with `--parameters DataBucket=data-bucket,IVSBucket=ivs-bucket`
```
Parameters:
  DataBucket:
    Type: String
    Default: act-player-video-archive
  IVSBucket:
    Type: String
    Default: ivs-act-1
```
To deploy the application, run `3-deploy.sh`.

    blank-nodejs$ ./3-deploy.sh
    added 16 packages from 18 contributors and audited 18 packages in 0.926s
    added 17 packages from 19 contributors and audited 19 packages in 0.916s
    Uploading to e678bc216e6a0d510d661ca9ae2fd941  2737254 / 2737254.0  (100.00%)
    Successfully packaged artifacts and wrote output template to file out.yml.
    Waiting for changeset to be created..
    Waiting for stack create/update to complete
    Successfully created/updated stack - blank-nodejs

This script uses AWS CloudFormation to deploy the Lambda functions and an IAM role. If the AWS CloudFormation stack that contains the resources already exists, the script updates it with any changes to the template or function code.

# Test
To invoke the function, run `4-invoke.sh`.

    blank-nodejs$ ./4-invoke.sh
    {
        "StatusCode": 200,
        "ExecutedVersion": "$LATEST"
    }
    {"AccountLimit":{"TotalCodeSize":80530636800,"CodeSizeUnzipped":262144000,"CodeSizeZipped":52428800,"ConcurrentExecutions":1000,"UnreservedConcurrentExecutions":933},"AccountUsage":{"TotalCodeSize":303678359,"FunctionCount":75}}

Let the script invoke the function a few times and then press `CRTL+C` to exit.

The application uses AWS X-Ray to trace requests. Open the [X-Ray console](https://console.aws.amazon.com/xray/home#/service-map) to view the service map. The following service map shows the function calling Amazon S3.

![Service Map](/sample-apps/blank-nodejs/images/blank-nodejs-servicemap.png)

Choose a node in the main function graph. Then choose **View traces** to see a list of traces. Choose any trace to view a timeline that breaks down the work done by the function.

![Trace](/sample-apps/blank-nodejs/images/blank-nodejs-trace.png)

Finally, view the application in the Lambda console.

*To view the application*
1. Open the [applications page](https://console.aws.amazon.com/lambda/home#/applications) in the Lambda console.
2. Choose **blank-nodejs**.

  ![Application](/sample-apps/blank-nodejs/images/blank-nodejs-application.png)

# Cleanup
To delete the application, run `5-cleanup.sh`.

    blank-nodejs$ ./5-cleanup.sh
    Deleted blank-nodejs stack.
    Delete deployment artifacts and bucket (lambda-artifacts-4475xmpl08ba7f8d)?y
    delete: s3://lambda-artifacts-4475xmpl08ba7f8d/6f2edcce52085e31a4a5ba823dba2c9d
    delete: s3://lambda-artifacts-4475xmpl08ba7f8d/3d3aee62473d249d039d2d7a37512db3
    remove_bucket: lambda-artifacts-4475xmpl08ba7f8d
    Delete function logs? (log group /aws/lambda/blank-nodejs-function-1RQTXMPLR0YSO)y

The cleanup script delete's the application stack, which includes the function and execution role, and local build artifacts. You can choose to delete the bucket and function logs as well.
