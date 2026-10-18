import { Injectable } from '@nestjs/common';

/** The app's source of "now". Tests replace it to control time at the rule boundaries. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
