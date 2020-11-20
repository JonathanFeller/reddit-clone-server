import { MyContext } from "src/types";
import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
  Root,
  UseMiddleware,
} from "type-graphql";
import { getConnection } from "typeorm";
import { Post } from "../entities/Post";
import { Vote } from "../entities/Vote";
import { isAuth } from "../middleware/isAuth";

@InputType()
class PostInput {
  @Field()
  title: string;
  @Field()
  text: string;
}

@ObjectType()
class PaginatedPosts {
  @Field(() => [Post])
  posts: Post[];
  @Field()
  hasMore: boolean;
}

@Resolver(Post)
export class PostResolver {
  @FieldResolver(() => String)
  textSnippet(@Root() root: Post) {
    return root.text.slice(0, 50);
  }

  @Query(() => PaginatedPosts)
  async posts(
    @Ctx() { req }: MyContext,
    @Arg("limit", () => Int) limit: number,
    @Arg("cursor", () => String, { nullable: true }) cursor: string | null
  ): Promise<PaginatedPosts> {
    const realLimit = Math.min(50, limit);
    const realLimitPlusOne = realLimit + 1;

    let replacements: any[] = [realLimitPlusOne];

    if (req.session!.userId) {
      replacements.push(req.session!.userId);
    }

    let cursorIdx = 3;
    if (cursor) {
      replacements.push(new Date(parseInt(cursor)));
      cursorIdx = replacements.length;
    }

    const posts = await getConnection().query(
      `select p.*, json_build_object(
        'id', u.id, 
        'username', u.username, 
        'email', u.email, 
        'createdAt', u."createdAt"
      ) "creator",
      ${
        req.session!.userId
          ? '(select value from "vote" where "userId"=$2 and "postId"=p.id) "voteStatus"'
          : 'null as "voteStatus"'
      }
      from "post" p 
      inner join "user" u on u.id = p."creatorId"
      ${cursor ? `where p."createdAt" < $${cursorIdx}` : ""}
      order by p."createdAt" DESC LIMIT $1`,
      replacements
    );

    return {
      posts: posts.slice(0, realLimit),
      hasMore: posts.length === realLimitPlusOne,
    };
  }

  @Query(() => Post, { nullable: true })
  post(@Arg("id", () => Int) id: number): Promise<Post | undefined> {
    return Post.findOne(id, { relations: ["creator"] });
  }

  @Mutation(() => Post)
  @UseMiddleware(isAuth)
  async createPost(
    @Arg("input") input: PostInput,
    @Ctx() { req }: MyContext
  ): Promise<Post | null> {
    return Post.create({ ...input, creatorId: req.session!.userId }).save();
  }

  @Mutation(() => Post, { nullable: true })
  async updatePost(
    @Arg("id") id: number,
    @Arg("title") title: string
  ): Promise<Post | undefined> {
    const post = await Post.findOne(id);
    if (!post) {
      return undefined;
    }
    if (typeof title !== "undefined") {
      await Post.update({ id }, { title });
    }
    return post;
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async deletePost(
    @Arg("id", () => Int) id: number,
    @Ctx() { req }: MyContext
  ): Promise<boolean> {
    const post = await Post.findOne(id);
    if (!post) {
      return false;
    }
    if (post.creatorId !== req.session!.userId) {
      throw new Error("Not authorized");
    }
    await Vote.delete({ postId: id });
    await Post.delete({ id });
    return true;
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async vote(
    @Arg("postId", () => Int) postId: number,
    @Arg("value", () => Int) value: number,
    @Ctx() { req }: MyContext
  ) {
    const realValue = value > 0 ? 1 : -1;
    const userId = req.session!.userId;

    const vote = await Vote.findOne({ where: { postId, userId } });
    if (vote && vote.value !== realValue) {
      await getConnection().transaction(async (tm) => {
        await tm.query(
          `UPDATE vote SET value=$1 WHERE "userId"=$2 AND "postId"=$3`,
          [realValue, userId, postId]
        );
        await tm.query(
          `UPDATE "post" p SET points = points + $1 WHERE p.id = $2`,
          [2 * realValue, postId]
        );
      });
    } else if (!vote) {
      await getConnection().transaction(async (tm) => {
        await tm.query(
          `INSERT INTO vote ("userId","postId",value) VALUES ($1,$2,$3)`,
          [userId, postId, realValue]
        );
        await tm.query(
          `UPDATE "post" p SET points = points + $1 WHERE p.id = $2`,
          [realValue, postId]
        );
      });
    }

    return true;
  }
}
