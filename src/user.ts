import { AuthenticationHelper } from './authenticationHelper';
import { Credentials } from './credentials';

export class User {
  public static async authenticate(server: string, credentials: Credentials): Promise<User> {
    return AuthenticationHelper.authenticate(server, credentials);
  }

  /**
   * Gets the identity of this user on the Realm Object Server. The identity is
   * guaranteed to be unique among all users on the Realm Object Server.
   */
  public identity: string;

  /**
   * Returns true if this user is an administrator.
   */
  public isAdmin: boolean;

  /**
   * Gets the server URL that was used for authentication.
   */
  public server: string;

  /**
   * Gets this user's refresh token. This is the user's credential for accessing the
   * Realm Object Server and should be treated as sensitive data.
   */
  public token: string;

  public constructor(init?: Partial<User>) {
    Object.assign(this, init);
  }

  public async logOut(): Promise<void> {
    try {
      await AuthenticationHelper.revoke(this);
    } catch {
      // Just ignore any network failures.
    }
    this.token = null;
  }
}
