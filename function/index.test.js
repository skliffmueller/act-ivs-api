const index = require('./index')
const fs = require('fs')
const AWSXRay = require('aws-xray-sdk-core')
AWSXRay.setContextMissingStrategy('LOG_ERROR')

test('Runs function handler', async () => {
    let eventFile = fs.readFileSync('./events/record-ended.json')
    let event = JSON.parse(eventFile)
    let response = await index.handler(event, null)
    expect(response).toEqual('application/json')
  }
)