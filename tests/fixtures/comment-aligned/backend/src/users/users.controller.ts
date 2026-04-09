import { Controller, Get } from "@nestjs/common";

@Controller("users")
export class UsersController {
  // GET /users lists all users.
  @Get()
  listUsers(): Promise<string[]> {
    return Promise.resolve([]);
  }
}
