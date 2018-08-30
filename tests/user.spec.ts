import { assert, expect } from 'chai';
import { v4 } from 'uuid';
import { Credentials, User } from '../src';
import { AuthenticationHelper } from '../src/authenticationHelper';
import { generateFakeDataRealm } from './generate-fake-data';
import { GraphQLTestServer } from './GraphQLTestServer';

describe('User', () => {
  let testServer: GraphQLTestServer;

  before(async () => {
    testServer = new GraphQLTestServer();
    await testServer.start();
  });

  after(async () => {
    await testServer.shutdown();
  });

  it('should authenticate with username/password', async () => {
    const credentials = Credentials.usernamePassword(v4(), 'a', true);
    const user = await User.authenticate(credentials, `http://${testServer.address}`);

    expect(user.token).to.be.not.empty;
  });

  describe('logout', () => {
    it('should invalidate token', async () => {
      const credentials = Credentials.usernamePassword(v4(), 'b', true);
      const user = await User.authenticate(credentials, `http://${testServer.address}`);

      const oldToken = user.token;
      await user.logOut();

      expect(user.token).to.be.null;

      // Try to reuse the old token;
      user.token = oldToken;

      try {
        await AuthenticationHelper.refreshAccessToken(user, `/${user.identity}/foo`);
        assert.fail(undefined, undefined, 'Expected token to be revoked');
      } catch (e) {
        expect(e.status).to.be.equal(403);
        expect(e.statusText).to.be.equal('Forbidden');
      }
    });
  });
});
