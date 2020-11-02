import { MikroORM } from "@mikro-orm/core";
import { Post } from "./entities/Post";
import { __prod__ } from "./constants";
import path from "path";
import { User } from "./entities/User";

export default {
  migrations: {
    path: path.join(__dirname, "./migrations"),
    pattern: /^[\w-]+\d+\.[tj]s$/,
  },
  entities: [Post, User],
  dbName: "postgres",
  type: "postgresql",
  user: "postgres",
  password: "postgresql",
  host: "192.168.99.100",
  debug: !__prod__,
} as Parameters<typeof MikroORM.init>[0];
