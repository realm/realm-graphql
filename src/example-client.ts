import gql from "graphql-tag";
import { Credentials } from "./Credentials";
import { GraphQLConfig } from "./GraphqlConfig";
import { User } from "./User";

const main = async () => {
    const credentials = Credentials.usernamePassword("realm-admin", "");
    const user = await User.authenticate(credentials, "http://localhost:9080");

    const config = await GraphQLConfig.create(
      user,
      "/~/test",
    );

    const client = config.createApolloClient();

    const observable = await client.subscribe({
        query: gql`
          subscription {
            foos {
              uuid
            }
          }
        `,
      });

    observable.subscribe({
        next(data) {
          const foos = data.data.foos;
          // console.log(foos);
          // Update you UI
        },
        error(value) {
          // console.log(value);
          // Notify the user of the failure
        },
      });

};

main();
