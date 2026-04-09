import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";

@Injectable({ providedIn: "root" })
export class UsersService {
  private readonly http = inject(HttpClient);

  createUser(payload: { email: string }) {
    return this.http.post<{ id: string }>("/api/users", payload);
  }
}
