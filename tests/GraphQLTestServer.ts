import * as fs from 'fs-extra';
import { resolve } from 'path';
import { GraphQLService } from 'realm-graphql-service';
import { TestServer } from 'realm-object-server';
import * as tmp from 'tmp';

/**
 * A subclass of a Test ROS Server that adds the graphql service by default
 */
export class GraphQLTestServer extends TestServer {

  private tmpDir;

  constructor() {
    super();
    this.addService(new GraphQLService());
  }

  public async start(params: any = {}) {
    this.tmpDir = tmp.dirSync();
    return super.start({
      dataPath: this.tmpDir.name,
      address: '127.0.0.1',
      httpsAddress: '127.0.0.1',
      port: 0,
      ...params
    });
  }

  public async shutdown() {
    await super.shutdown();
    Realm.Sync.removeAllListeners();
    // Remove the temporary dir
    fs.removeSync(this.tmpDir.name);
  }
}
