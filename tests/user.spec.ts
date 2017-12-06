import { expect, assert } from 'chai';
import { Credentials, User } from '../src';
import { generateFakeDataRealm } from './generate-fake-data';
import { GraphQLTestServer } from './GraphQLTestServer';
import { AuthenticationHelper } from '../src/authenticationHelper';

describe('User', function() {

  let testServer: GraphQLTestServer;

  before(async () => {
    testServer = new GraphQLTestServer();
    await testServer.start();
  });

  after(async () => {
    await testServer.shutdown();
  });

  it('should authenticate with username/password', async () => {
    const credentials = Credentials.UsernamePassword('a@a', 'a', true);
    const user = await User.authenticate(`http://${testServer.address}`, credentials);

    expect(user.token).to.be.not.empty;
  });

  describe('logout', () => {
    it('should invalidate token', async () => {
      const credentials = Credentials.UsernamePassword('b@b', 'b', true);
      const user = await User.authenticate(`http://${testServer.address}`, credentials);

      const oldToken = user.token;
      await user.logOut();
      
      expect(user.token).to.be.null;
      
      // Try to reuse the old token;
      user.token = oldToken;
      
      try {
        await AuthenticationHelper.refreshAccessToken(user, `/${user.identity}/foo`);
        assert.fail(undefined, undefined, 'Expected token to be revoked');
      }
      catch (e) {
        expect(e.status).to.be.equal(403);
        expect(e.statusText).to.be.equal('Forbidden');
      }
    });
  });
});
