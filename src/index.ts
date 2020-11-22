import "reflect-metadata";
import "dotenv-safe/config";
import { ApolloServer } from "apollo-server-express";
import connectRedis from "connect-redis";
import cors from "cors";
import express from "express";
import session from "express-session";
import Redis from "ioredis";
import path from "path";
import { buildSchema } from "type-graphql";
import { createConnection } from "typeorm";
import { COOKIE_NAME, __prod__ } from "./constants";
import { Post } from "./entities/Post";
import { User } from "./entities/User";
import { Vote } from "./entities/Vote";
import { HelloResolver } from "./resolvers/hello";
import { PostResolver } from "./resolvers/post";
import { UserResolver } from "./resolvers/user";
import { MyContext } from "./types";
import { createUserLoader } from "./util/createUserLoader";
import { createVoteLoader } from "./util/createVoteLoader";

const main = async () => {
  const conn = await createConnection({
    type: "postgres",
    url: process.env.DATABASE_URL,
    logging: !__prod__,
    synchronize: !__prod__,
    migrations: [path.join(__dirname, "./migrations/*")],
    entities: [Post, User, Vote],
  });
  conn.runMigrations();

  const app = express();

  const RedisStore = connectRedis(session);
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  });

  app.set("trust proxy", 1);
  app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
  app.use(
    session({
      name: COOKIE_NAME,
      store: new RedisStore({
        client: redis,
        disableTouch: true,
      }),
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 365 * 10, //10 years
        httpOnly: true,
        sameSite: "lax", // csrf
        secure: __prod__, //only https
        domain: __prod__ ? ".jonathanfeller.com" : undefined,
      },
      saveUninitialized: false,
      secret: process.env.SESSION_SECRET,
      resave: false,
    })
  );

  const apolloServer = new ApolloServer({
    schema: await buildSchema({
      resolvers: [HelloResolver, PostResolver, UserResolver],
      validate: false,
    }),
    context: ({ req, res }): MyContext => ({
      req,
      res,
      redis,
      userLoader: createUserLoader(),
      voteLoader: createVoteLoader(),
    }),
  });

  apolloServer.applyMiddleware({
    app,
    cors: false,
  });

  app.listen(process.env.PORT, () => {
    console.log("Server started on port " + process.env.PORT);
  });
};

main().catch((err) => console.log(err));
