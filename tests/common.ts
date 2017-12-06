import { GraphQLTestServer } from "./GraphQLTestServer";
import { generateFakeDataRealm } from "./generate-fake-data";

export let testServer: GraphQLTestServer;

before(async () => {
  testServer = new GraphQLTestServer();
  await testServer.start();
});  

after(async () => {
  await testServer.shutdown();
});