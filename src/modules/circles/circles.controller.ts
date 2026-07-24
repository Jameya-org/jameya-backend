import { Controller } from '@nestjs/common';
import { CirclesService } from './circles.service';

@Controller('circles')
export class CirclesController {
  constructor(private readonly circlesService: CirclesService) {}
}
