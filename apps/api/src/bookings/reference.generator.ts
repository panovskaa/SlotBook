import { Injectable } from '@nestjs/common';
import { REFERENCE_ALPHABET, REFERENCE_LENGTH, formatReference } from '@slotbook/shared';
import { randomInt } from 'crypto';

/** Makes booking references like K7M2-QX9P (FR-6). A class so tests can swap it to force collisions. */
@Injectable()
export class ReferenceGenerator {
  next(): string {
    let code = '';
    for (let i = 0; i < REFERENCE_LENGTH; i++) code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
    return formatReference(code);
  }
}
