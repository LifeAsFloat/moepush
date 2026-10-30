import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { authSchema } from "@/lib/validation";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/utils";

export const runtime = "edge";

export async function POST(request: Request) {
  if (process.env.DISABLE_REGISTER === "true") {
    return NextResponse.json(
      { message: "注册已关闭" },
      { status: 403 }
    );
  }
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ message: "请求格式错误" }, { status: 400 });
    }

    const parsed = authSchema.safeParse(json);
    if (!parsed.success) {
      // 把具体的校验失败原因返回给前端，而不是笼统的"注册失败"
      return NextResponse.json(
        { message: parsed.error.errors[0]?.message ?? "输入格式不正确" },
        { status: 400 }
      );
    }
    const { username, password } = parsed.data;

    const db = getDb();
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, username),
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "用户名已存在" },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(password);

    await db.insert(users).values({
      username,
      password: hashedPassword,
      name: username,
    });

    return NextResponse.json(
      { message: "注册成功" },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    // 唯一索引冲突（并发注册同一用户名）
    if (error instanceof Error && /UNIQUE/i.test(error.message)) {
      return NextResponse.json({ message: "用户名已存在" }, { status: 400 });
    }
    return NextResponse.json(
      { message: "注册失败，请稍后重试" },
      { status: 500 }
    );
  }
} 