#!/usr/bin/env node

const searchTerm = "d46666ff-ec03-4197-b9f4-a3fb58de306c_gen1_enricher_1753159507423";

console.log(`Searching for API response with callId: ${searchTerm}`);
console.log('Run this command to get the full response:');
console.log(`
PATH="/Users/yonatanloewidt/google-cloud-sdk/bin:$PATH" gcloud logging read 'resource.type="cloud_run_revision" AND "API_RESPONSE_REPLAY" AND "${searchTerm}"' --limit=1 --format=json --project=evolutionsolver | jq -r '.[0].jsonPayload' > failed-response.json

# Then examine with:
cat failed-response.json | jq '.fullResponse' -r | jq '.'
`);