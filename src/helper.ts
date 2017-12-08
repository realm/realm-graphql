import { ApolloLink } from 'apollo-link';
import { setContext } from 'apollo-link-context';
import { setTimeout } from 'timers';
import * as URI from 'urijs';
import { AccessToken, AuthenticationHelper } from './authenticationHelper';
import { User } from './user';

export interface HelperConfig {
  user: User;
  realmPath: string;
  authErrorHandler?: (error: any) => boolean;
}

export class RealmHelper {
  public static async create(config: HelperConfig): Promise<RealmHelper> {
    const accessToken = await AuthenticationHelper.refreshAccessToken(config.user, config.realmPath);
    return new RealmHelper(config, accessToken);
  }

  public httpEndpoint: string;
  public webSocketEndpoint: string;
  public connectionParams: () => any;
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
