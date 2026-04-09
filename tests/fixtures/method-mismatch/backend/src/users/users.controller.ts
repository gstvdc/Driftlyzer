import { Controller, Get } from "@nestjs/common";

type UserDto = {
  id: string;
};

@Controller("users")
export class UsersController {
  @Get()
  listUsers(): Promise<UserDto[]> {
    return Promise.resolve([]);
  }
}
