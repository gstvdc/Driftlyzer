import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

type UserDto = {
  id: string;
  fullName: string;
};

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);

  listUsers() {
    return this.http.get<UserDto[]>('/api/users');
  }

  inviteUser(payload: { email: string }) {
    return this.http.post<UserDto>('/api/users/invite', payload);
  }
}
