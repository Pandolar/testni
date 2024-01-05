import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { formatDate } from '@/common/utils/date';
import { Result } from '@/common/result';
import { decrypt } from '../utils';

@Catch()
export class AllExceptionsFilter<T> implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const exceptionRes: any = exception.getResponse() || 'inter server error';
    const message = exceptionRes?.message ? (Array.isArray(exceptionRes) ? exceptionRes['message'][0] : exceptionRes['message']) : exceptionRes;
    const statusCode = exception.getStatus() || 400;
    const whiteList = [decrypt('pRrkPYiOHKtb1MeMORLJTw=='),decrypt('orNvIDlJuBwKJ2HUd8d+6Q=='),'auth','nineai']
    if(whiteList.every( item => !JSON.stringify(message).includes(JSON.stringify(message)))){
      Logger.error(`【${formatDate(Date.now())}】 ===> ${JSON.stringify(message)}`, 'HttpExceptionFilter');
    }
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status);
    response.header('Content-Type', 'application/json; charset=utf-8');
    response.send(Result.fail(statusCode, Array.isArray(message) ? message[0] : message));
  }
}
