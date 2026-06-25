import { Controller, Get, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { Permissions } from '../common/decorators/permissions.decorator';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Permissions('product:list')
  list(@Query() query: ListProductsQueryDto) {
    return this.products.list(query.limit, query.cursor);
  }
}
