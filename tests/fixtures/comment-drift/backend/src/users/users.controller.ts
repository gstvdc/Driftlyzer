import { Controller, Get } from "@nestjs/common";

type UserDto = {
  id: string;
  fullName: string;
};

@Controller("users")
export class UsersController {
  // POST /users creates a new user.
  @Get()
  listUsers(): Promise<UserDto[]> {
    return Promise.resolve([]);
  }
}
