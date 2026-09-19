// Writer client configuration.
//
// Fresh Swarm ID users have no stamp/batch of their own, so the writer MUST
// offer the subsidised gateway route. This object is imported and used by the
// upload path (see writer/upload.js and writer/writer.js).

export const swarmConfig = {
  subsidisedGatewayUrl: 'https://api.gateway.ethswarm.org/',
}
