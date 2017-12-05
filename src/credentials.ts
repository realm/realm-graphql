/**
 * A class, representing the credentials used for authenticating a User.
 */
export class Credentials {
  /**
   * Creates Credentials based on a Facebook login.
   * @param {string} facebookToken A Facebook authentication token, obtained by logging into Facebook.
   */
  public static Facebook(facebookToken: string): Credentials {
    return {
      data: facebookToken,
      provider: 'facebook',
    };
  }

  /**
   * Creates Credentials based on a Google login.
   * @param {string} googleToken A Google authentication token, obtained by logging into Google.
   */
  public static Google(googleToken: string): Credentials {
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
   */
  public static UsernamePassword(username: string, password: string, createUser?: boolean): Credentials {
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
   */
  public static AzureAD(adToken: string): Credentials {
    return {
      data: adToken,
      provider: 'azuread'
    };
  }

  /**
   * Create Credentials based on a login into a custom system.
   * @param jwtToken An Json Web Token, obtained by logging into your custom authentication system.
   * @see {@link https://realm.io/docs/realm-object-server/latest#jwt-custom-authentication}
   */
  public static JWT(jwtToken: string): Credentials {
    return {
      data: jwtToken,
      provider: 'jwt'
    };
  }

  public data: string;
  public provider: string;

  /* tslint:disable-next-line:variable-name */
  public user_info?: any;
}
