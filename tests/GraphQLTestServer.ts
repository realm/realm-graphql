import { TestServer } from 'realm-object-server'
import { GraphQLService } from '../../realm-object-server-graphql/src/service'

/**
 * A subclass of a Test ROS Server that adds the graphql service by default
 */
export class GraphQLTestServer extends TestServer {

    constructor() {
        super()
        this.addService(new GraphQLService())
    }

}