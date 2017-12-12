import { AuthenticationHelper } from './authenticationHelper';
import { Credentials } from './credentials';

/**
 * This class represents a user on the Realm Object Server. The credentials are provided
 * by various 3rd party providers (Facebook, Google, etc.). A user can log in to the Realm
 * Object Server, and if access is granted, it is possible to query the remote Realm.
 * Moreover, synchronization is halted when the user is logged out. It is possible to
 * persist a user. By retrieving a user, there is no need to log in to the 3rd party
 * provider again. Persisting a user between sessions, the user's credentials are stored
 * locally on the device, and should be treated as sensitive data.
 */
export class User {
  /**
   * Authenticates the user against the Realm Object Server.
   * @param credentials The credentials to use for authentication.
   * @param server The url of the server that the user is authenticated against.
   * @returns A Promise, that, when resolved, contains the logged in user.
   */
  public static async authenticate(credentials: Credentials, server: string): Promise<User> {
    return AuthenticationHelper.authenticate(credentials, server);
  }

  /**
   * @readonly
   * Gets the identity of this user on the Realm Object Server. The identity is
   * guaranteed to be unique among all users on the Realm Object Server.
   */
  public identity: string;

  /**
   * @readonly
   * Returns true if this user is an administrator.
   */
  public isAdmin: boolean;

  /**
   * @readonly
   * Gets the server URL that was used for authentication.
   */
  public server: string;

  /**
   * @readonly
   * Gets this user's refresh token. This is the user's credential for accessing the
   * Realm Object Server and should be treated as sensitive data.
   */
  public token: string;

  /**
   * Initializes a new `User` instance. Use this when you have previously stored the
   * user object and want to recreate it without prompting the user for login. Otherwise,
   * use [[authenticate]].
   * @param init The properties on the User you wish to assign.
   */
  public constructor(init: Partial<User>) {
    Object.assign(this, init);
  }

  /**
   * Logs out the user from the Realm Object Server. Once the Object Server has
   * confirmed the logout the user credentials will be invalidated and the user
   * will need to login again.
   */
  public async logOut(): Promise<void> {
    try {
      await AuthenticationHelper.revoke(this);
    } catch {
      // Just ignore any network failures.
    }
    this.token = null;
  }
}
