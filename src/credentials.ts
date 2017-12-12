/**
 * A class, representing the credentials used for authenticating a [[User]].
 */
export class Credentials {
  /**
   * Creates Credentials based on a Facebook login.
   * @param {string} facebookToken A Facebook authentication token, obtained by logging into Facebook.
   * @returns An instance of [[Credentials]] that can be passed to [[User.authenticate]].
   */
  public static facebook(facebookToken: string): Credentials {
    return {
      data: facebookToken,
      provider: 'facebook',
    };
  }

  /**
   * Creates Credentials based on a Google login.
   * @param {string} googleToken A Google authentication token, obtained by logging into Google.
   * @returns An instance of [[Credentials]] that can be passed to [[User.authenticate]].
   */
  public static google(googleToken: string): Credentials {
    return {
      data: googleToken,
      provider: 'google'
    };
  }

  /**
   * Creates Credentials based on a login with a username and a password.
   * @param username The username of the user.
   * @param password The user's password.
   * @param createUser A value indicating whether the user should be created.
   * @returns An instance of [[Credentials]] that can be passed to [[User.authenticate]].
   */
  public static usernamePassword(username: string, password: string, createUser?: boolean): Credentials {
    return {
      data: username,
      provider: 'password',
      user_info: {
        register: createUser || false,
        password
      }
    };
  }

  /**
   * Creates Credentials based on an Active Directory login.
   * @param adToken An access token, obtained by logging into Azure Active Directory.
   * @returns An instance of [[Credentials]] that can be passed to [[User.authenticate]].
   */
  public static azureAD(adToken: string): Credentials {
    return {
      data: adToken,
      provider: 'azuread'
    };
  }

  /**
   * Create Credentials based on a login into a custom system.
   * @param jwtToken An Json Web Token, obtained by logging into your custom authentication system.
   * @returns An instance of [[Credentials]] that can be passed to [[User.authenticate]].
   * @see {@link https://realm.io/docs/realm-object-server/latest#jwt-custom-authentication Realm
   * Object Server documentation} for custom authentication via JWT.
   */
  public static jwt(jwtToken: string): Credentials {
    return {
      data: jwtToken,
      provider: 'jwt'
    };
  }

  /**
   * Creates Credentials based on an admin token. It's recommended that it is not used in production
   * as the admin token is sensitive data that should ideally not leave the server.
   * @param adminToken The Admin token obtained from ROS.
   * @returns An instance of [[Credentials]] that can be passed to [[User.authenticate]].
   */
  public static admin(adminToken: string): Credentials {
    return {
      data: adminToken,
      provider: '__admin'
    };
  }

  /**
   * Creates Credentials without user identity information. It can only be used if `disableAuthentication`
   * is set to `true` in the GraphQL Service's config.
   * @returns An instance of [[Credentials]] that can be passed to [[User.authenticate]].
   */
  public static anonymous(): Credentials {
    return {
      data: null,
      provider: '__anonymous'
    };
  }

  /**
   * Creates Credentials based on a login with a custom system.
   * @param provider Provider used to verify the credentials.
   * @param token String identifying the user. Usually a username or user token.
   * @param userInfo Data describing the user further or null if the user does not have any extra data.
   * The data will be serialized to JSON, so all values must be mappable to a valid JSON data type.
   * @returns An instance of [[Credentials]] that can be passed to [[User.authenticate]].
   * @see {@link https://realm.io/docs/realm-object-server/latest#advanced-custom-authentication Realm
   * Object Server docs} for advanced custom authentication.
   */
  public static Custom(provider: string, token: string, userInfo?: any): Credentials {
    return {
      provider,
      data: token,
      user_info: userInfo
    };
  }

  /**
   * @hidden
   */
  public data: string;

  /**
   * @hidden
   */
  public provider: string;

  /**
   * @hidden
   */
  /* tslint:disable-next-line:variable-name */
  public user_info?: any;
}
