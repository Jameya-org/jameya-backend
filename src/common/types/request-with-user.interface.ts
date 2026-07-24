import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  roles?: string[];
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}
