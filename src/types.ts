import { Request, Response } from "express";
import { Redis } from "ioredis";
import { createUserLoader } from "./util/createUserLoader";
import { createVoteLoader } from "./util/createVoteLoader";

export type MyContext = {
  req: Request;
  res: Response;
  redis: Redis;
  userLoader: ReturnType<typeof createUserLoader>;
  voteLoader: ReturnType<typeof createVoteLoader>;
};
