import { ApolloLink } from 'apollo-link';
import { setContext } from 'apollo-link-context';
import * as URI from 'urijs';
import { AccessToken, AuthenticationHelper } from './authenticationHelper';
import { User } from './user';

export class RealmHelper {
  public static async create(user: User, realmPath: string): Promise<RealmHelper> {
    const accessToken = await AuthenticationHelper.refreshAccessToken(user, realmPath);
    return new RealmHelper(user, realmPath, accessToken);
  }

  public httpEndpoint: string;
  public webSocketEndpoint: string;
  public connectionParams: () => any;
  public authLink: ApolloLink;

  private constructor(user: User, realmPath: string, accessToken: AccessToken) {
    const token = accessToken.token;

    // TODO: setup refreshing!

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
      return {
        token
      };
    };

    this.authLink = setContext((_, { headers }) => {
      return {
        headers: {
          ...headers,
          authorization: token
        }
      };
    });
  }
}
