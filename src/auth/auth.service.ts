import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { UserService } from 'src/user/user.service';
import { hash, verify } from 'argon2';
import { AuthJwtPayload } from 'src/types/auth-jwtPayload';
import { JwtService } from '@nestjs/jwt';
import refreshConfig from './config/refresh.config';
import type { ConfigType } from '@nestjs/config';
import { Role } from 'src/types/enums';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    @Inject(refreshConfig.KEY)
    private refreshTokenConfig: ConfigType<typeof refreshConfig>,
  ) {}

  async registerUser(createUserDto: CreateUserDto) {
    const user = await this.userService.findByEmail(createUserDto.email);
    if (user) throw new ConflictException('User already exists!');
    return this.userService.create(createUserDto);
  }

  async validateLocalUser(
    email: string,
    password: string,
  ): Promise<{ id: string; name: string; role: Role }> {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.password)
      throw new UnauthorizedException(
        'This account uses Google login. Please sign in with Google.',
      );
    const isPasswordMatched = await verify(user.password, password);
    if (!isPasswordMatched)
      throw new UnauthorizedException('Invalid credentials');
    return { id: user.id, name: user.name, role: user.role };
  }

  async login(userId: string, name?: string, role?: Role) {
    const { accessToken, refreshToken } = await this.generateTokens(
      userId,
      role,
    );
    const hashedRT = await hash(refreshToken);
    await this.userService.updateHashedRefreshToken(userId, hashedRT);
    return { id: userId, name, role, accessToken, refreshToken };
  }

  async generateTokens(userId: string, role?: Role) {
    const payload: AuthJwtPayload = { sub: userId, role: role ?? Role.PATIENT };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, this.refreshTokenConfig),
    ]);
    return { accessToken, refreshToken };
  }

  async validateJwtUser(userId: string) {
    const user = await this.userService.findOne(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return { id: user.id, name: user.name, role: user.role };
  }

  async validateRefreshToken(userId: string, refreshToken: string) {
    const user = await this.userService.findOne(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.hashedRefreshToken)
      throw new UnauthorizedException('No refresh token found');
    const refreshTokenMatched = await verify(
      user.hashedRefreshToken,
      refreshToken,
    );
    if (!refreshTokenMatched)
      throw new UnauthorizedException('Invalid refresh token');
    return { id: user.id, name: user.name, role: user.role };
  }

  async refreshToken(userId: string, name: string, role: Role) {
    const { accessToken, refreshToken } = await this.generateTokens(
      userId,
      role,
    );
    const hashedRT = await hash(refreshToken);
    await this.userService.updateHashedRefreshToken(userId, hashedRT);
    return { id: userId, name, accessToken, refreshToken };
  }

  async validateGoogleUser(googleUser: CreateUserDto) {
    const user = await this.userService.findByEmail(googleUser.email);
    if (!user) {
      return await this.userService.create(googleUser);
    }
    return user;
  }

  signOut(userId: string) {
    return this.userService.updateHashedRefreshToken(userId, null);
  }
}