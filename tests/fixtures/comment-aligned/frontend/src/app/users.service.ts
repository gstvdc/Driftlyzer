import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";

@Injectable({ providedIn: "root" })
export class UsersService {
  private readonly http = inject(HttpClient);

  listUsers() {
    return this.http.get<string[]>("/api/users");
  }
}
