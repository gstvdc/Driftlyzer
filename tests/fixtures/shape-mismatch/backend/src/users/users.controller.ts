import { Body, Controller, Get, Post } from '@nestjs/common';

type CreateUserDto = {
  email: string;
};

type UserDto = {
  id: string;
  fullName: string;
};

@Controller('users')
export class UsersController {
  @Get()
  listUsers(): Promise<UserDto[]> {
    return Promise.resolve([]);
  }

  @Post('invite')
  inviteUser(@Body() dto: CreateUserDto): Promise<UserDto> {
    return Promise.resolve({ id: '1', fullName: dto.email });
  }
}
