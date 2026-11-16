import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { ApproverGuard, AuthGuard, PowerGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { Approver, Employee, OtRequest, RequestLine, Session } from './entities';
import { EmployeesService } from './employees.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { SeedService } from './seed.service';
import { AppController } from './app.controller';
import { EmployeesController } from './employees.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'mysql' as const,
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        username: process.env.DB_USER || 'overtime',
        password: process.env.DB_PASS || 'overtime',
        database: process.env.DB_NAME || 'overtime',
        entities: [Employee, Approver, Session, OtRequest, RequestLine],
        synchronize: true,
        charset: 'utf8mb4',
        timezone: '+05:00',
        retryAttempts: 30,
        retryDelay: 3000,
      }),
    }),
    TypeOrmModule.forFeature([Employee, Approver, Session, OtRequest, RequestLine]),
  ],
  controllers: [AppController, AuthController, RequestsController, ReportsController, EmployeesController],
  providers: [EmployeesService, AuthService, AuthGuard, ApproverGuard, PowerGuard, RequestsService, ReportsService, SeedService],
})
export class AppModule {}
