import { setTimeout } from 'timers';
import * as URI from 'urijs';
import { Credentials } from './credentials';
import { User } from './user';

/**
 * @hidden
 */
export interface AccessToken {
  token: string;
  expires: number;
}

/**
 * @hidden
 */
export class AuthenticationHelper {
  public static async authenticate(credentials: Credentials, server: string): Promise<User> {
    const authUri = new URI(server).path('/auth');
    if (authUri.scheme() !== 'http' && authUri.scheme() !== 'https') {
      throw new Error(`The server scheme must be 'http(s)'. Got: ${authUri.scheme()} `);
    }

    // Anonymous user
    if (credentials.provider === '__anonymous') {
      return new User({
        identity: null,
        isAdmin: false,
        server,
        token: null
      });
    }

    // Admin token, just return a fake user
    if (credentials.provider === '__admin') {
      const result = new User({
        identity: '__admin',
        isAdmin: true,
        server,
        token: credentials.data
      });

      // Hack: mark the user as token user to short-circuit token refreshes.
      (result as any).isTokenUser = true;

      return result;
    }

    (credentials as any).app_id = '';
    const options = {
      method: 'POST',
      body: JSON.stringify(credentials),
      headers: AuthenticationHelper.postHeaders,
      open_timeout: 5000
    };

    const response = await AuthenticationHelper.fetch(authUri.toString(), options);
    const body = await response.json();
    if (response.status !== 200) {
      throw {
        name: 'AuthError',
        status: response.status,
        statusText: response.statusText,
        body
      };
    } else {
      return new User({
        identity: body.refresh_token.token_data.identity,
        isAdmin: body.refresh_token.token_data.is_admin,
        server,
        token: body.refresh_token.token
      });
    }
  }

  public static async refreshAccessToken(user: User, realmPath: string): Promise<AccessToken> {
    if (!user.server) {
      throw new Error('Server for user must be specified');
    }

    if (user.identity === null && user.token === null) {
      return {
        token: null,
        expires: null
      };
    }

    if ((user as any).isTokenUser) {
      return {
        token: user.token,
        expires: null // It doesn't expire
      };
    }

    const options = {
      method: 'POST',
      body: JSON.stringify({
        data: user.token,
        path: realmPath,
        provider: 'realm',
        app_id: ''
      }),
      headers: AuthenticationHelper.postHeaders,
      timeout: 5000.0
    };

    const authUri = new URI(user.server).path('/auth');

    const response = await AuthenticationHelper.fetch(authUri.toString(), options);
    const body = await response.json();

    if (response.status !== 200) {
      throw {
        name: 'AuthError',
        status: response.status,
        statusText: response.statusText,
        body
      };
    }

    return {
      token: body.access_token.token,
      expires: body.access_token.token_data.expires * 1000
    };
  }

  public static async revoke(user: User): Promise<void> {
    if (!user.server) {
      throw new Error('Server for user must be specified');
    }

    if ((user as any).isTokenUser) {
      // Admin token can't be revoked
      return;
    }

    const options = {
      method: 'POST',
      body: JSON.stringify({
        token: user.token
      }),
      headers: { authorization: user.token, ...AuthenticationHelper.postHeaders },
      timeout: 5000.0
    };

    const authUri = new URI(user.server).path('/auth/revoke');
    const response = await AuthenticationHelper.fetch(authUri.toString(), options);

    if (response.status !== 200) {
      const body = await response.json();
      throw {
        name: 'AuthError',
        status: response.status,
        statusText: response.statusText,
        body
      };
    }
  }

  private static fetch = AuthenticationHelper.getFetch();
  private static postHeaders = {
    'content-type': 'application/json;charset=utf-8',
    'accept': 'application/json'
  };

  private static getFetch() {
    if (typeof fetch !== 'undefined') {
      return fetch.bind(window);
    }
    if (this.fetch === undefined) {
      this.fetch = require('node-fetch');
    }
    return this.fetch;
  }

}
