import { Role } from './enums';

export type AuthJwtPayload = {
  sub: string; // user id (UUID string)
  role: Role;
};