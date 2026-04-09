import { Controller, Get } from "@nestjs/common";

@Controller("users")
export class UsersController {
  @Get()
  listUsers(): Promise<string[]> {
    return Promise.resolve([]);
  }
}
