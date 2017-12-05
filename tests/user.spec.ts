import { expect } from 'chai';
import { Credentials, User } from '../src';
import { generateFakeDataRealm } from './generate-fake-data';
import { GraphQLTestServer } from './GraphQLTestServer';

describe('User', function() {

  let testServer: GraphQLTestServer;

  before(async () => {
    testServer = new GraphQLTestServer();
    await testServer.start();
  });

  after(async () => {
    await testServer.shutdown();
  });

  describe('authenticate', function() {
    it('should login user', async () => {
      const credentials = Credentials.UsernamePassword('a@a', 'a', true);
      const user = await User.authenticate(`http://${testServer.address}`, credentials);

      expect(user.token).to.be.not.empty;
    });
  });
});
