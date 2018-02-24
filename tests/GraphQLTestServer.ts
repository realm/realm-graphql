import { TestServer } from 'realm-object-server';
import { GraphQLService } from 'realm-graphql-service';
import * as fs from 'fs-extra'
import * as tmp from 'tmp';
import * as path from 'path';

/**
 * A subclass of a Test ROS Server that adds the graphql service by default
 */
export class GraphQLTestServer extends TestServer {

    constructor() {
        super();
        this.addService(new GraphQLService());
    }

    public async start(params: any = {}) {
        await fs.remove('./realm-object-server')
        await fs.mkdirs('./realm-object-server/io.realm.object-server-utility/metadata/')

        const tmpDir = tmp.dirSync();
        return super.start(Object.assign({
            dataPath: tmpDir.name,
            address: '127.0.0.1',
            httpsAddress: '127.0.0.1',
            port: 0,
        }, params));
    }

    public async shutdown() {
        await super.shutdown();
        Realm.Sync.removeAllListeners();
    }
}
