import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

type FrontendUserDto = {
  id: string;
  name: string;
};

type InvitePayload = {
  name: string;
};

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);

  listUsers() {
    return this.http.get<FrontendUserDto[]>('/api/users');
  }

  inviteUser(payload: InvitePayload) {
    return this.http.post<FrontendUserDto>('/api/users/invite', payload);
  }
}
