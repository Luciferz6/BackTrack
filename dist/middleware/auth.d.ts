import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: string;
                iat: number;
                exp: number;
            };
        }
    }
}
export declare const authenticate: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.d.ts.map