import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-google-oauth20";
import goggleOauthConfig from "../config/goggle-oauth.config";
import type { ConfigType } from "@nestjs/config";
import { Inject, Injectable } from "@nestjs/common";
import { VerifyCallback } from "passport-google-oauth20"
import { AuthService } from "../auth.service";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy){
    constructor(@Inject(goggleOauthConfig.KEY)
     private readonly googleOAuthConfig:ConfigType<typeof goggleOauthConfig>,private authService:AuthService)
     {
        super({ 
          clientID:googleOAuthConfig.clientID,
          clientSecret:googleOAuthConfig.clientSecret,
          callbackURL:googleOAuthConfig.callbackURL,
          scope:['email','profile'],
                }as any);
    }

async validate(accessToken:string,refreshToken:string,profile:any,done:VerifyCallback){
    

    const user=await this.authService.validateGoogleUser({
        email:profile.emails[0].value,
        name:profile.displayName,
        password:``,
    });


    done(null,user);
    // return user same, it will apend the user of the request
    //request.user
}

}