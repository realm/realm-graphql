import { ApolloLink } from 'apollo-link';
import { setContext } from 'apollo-link-context';
import { setTimeout } from 'timers';
import * as URI from 'urijs';
import { AccessToken, AuthenticationHelper } from './authenticationHelper';
import { User } from './user';

export interface HelperConfig {
  /**
   * TODO
   */
  user: User;

  /**
   * TODO
   */
  realmPath: string;

  /**
   * TODO
   */
  authErrorHandler?: (error: any) => boolean;
}

export class RealmGraphQL {
  public static async create(config: HelperConfig): Promise<RealmGraphQL> {
    const accessToken = await AuthenticationHelper.refreshAccessToken(config.user, config.realmPath);
    return new RealmGraphQL(config, accessToken);
  }

  /**
   * TODO
   */
  public httpEndpoint: string;

  /**
   * TODO
   */
  public webSocketEndpoint: string;

  /**
   * TODO
   */
  public connectionParams: () => any;

  /**
   * TODO
   */
  public authLink: ApolloLink;

  private constructor(config: HelperConfig, accessToken: AccessToken) {
    let token = accessToken.token;
    const user = config.user;
    const realmPath = config.realmPath.replace('/~/', `/${user.identity}/`);
    const authErrorHandler = config.authErrorHandler;

    const refresh = (afterDelay: number) => {
      setTimeout(async () => {
        if (!user.token) {
          // User logged out, stop refreshing
          return;
        }

        try {
          const result = await AuthenticationHelper.refreshAccessToken(user, realmPath);
          token = result.token;

          refresh(result.expires - Date.now() - 10000);
        } catch (e) {
          if (!authErrorHandler || !authErrorHandler(e)) {
            refresh(3000);
          }
        }
      }, afterDelay);
    };

    if (accessToken.expires) {
      refresh(accessToken.expires - Date.now() - 10000);
    }

    const grahpQLEndpoint = new URI(user.server).segmentCoded(['graphql', realmPath]);
    this.httpEndpoint = grahpQLEndpoint.toString();

    let subscriptionScheme: string;
    switch (grahpQLEndpoint.scheme()) {
      case 'http':
        subscriptionScheme = 'ws';
        break;
      case 'https':
        subscriptionScheme = 'wss';
        break;
      default:
        throw new Error(`Unrecognized scheme for the server endpoint: ${grahpQLEndpoint.scheme()}`);
    }

    this.webSocketEndpoint = grahpQLEndpoint.clone().scheme(subscriptionScheme).toString();
    this.connectionParams = () => {
      if (token) {
        return {
          token
        };
      }

      return {};
    };

    this.authLink = setContext((_, { headers }) => {
      if (token) {
        return {
          headers: {
            ...headers,
            authorization: token
          }
        };
      }
    });
  }
}
