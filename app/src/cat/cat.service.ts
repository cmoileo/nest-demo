import { Inject, Injectable, NotFoundException, Param } from '@nestjs/common';
import { CreateCatDto, UpdateCatDto } from '@/cat/dtos/cat-input.dto';
import { CatEntity } from '@/cat/cat.entity';
import { FindManyOptions, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { BreedService } from '@/breed/breed.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy } from '@nestjs/microservices';
import { UserEntity } from '@/user/entities/user.entity';
import { UserService } from '@/user/user.service';
import { CreateCrossbreedCatDto } from '@/cat/dtos/create-crossbredd-cat.dto';

export interface CatFindAllOptions extends FindManyOptions<CatEntity> {
  breedId?: string;
  includeBreed?: boolean;
  userId?: string;
  includeUser?: boolean;
}

@Injectable()
export class CatService {
  constructor(
    @InjectRepository(CatEntity)
    private readonly catRepository: Repository<CatEntity>,
    private readonly breedService: BreedService,
    private readonly userService: UserService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(CatEntity)
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @Inject('COLORS_SERVICE') private client: ClientProxy,
  ) {}

  async findAll(options?: CatFindAllOptions): Promise<CatEntity[]> {
    return this.catRepository.find({
      relations: [
        ...(options?.includeBreed ? ['breed'] : []),
        ...(options?.includeUser ? ['user'] : []),
        'comments',
      ],
      where: {
        breedId: options?.breedId,
        userId: options?.userId,
      },
    });
  }

  async findOne(id: string, includeBreed?: boolean): Promise<CatEntity> {
    const cat = await this.catRepository.findOne({
      where: { id },
      relations: includeBreed ? ['breed'] : undefined,
    });
    if (!cat) {
      throw new NotFoundException('Cat not found');
    }
    return cat;
  }

  async create(cat: CreateCatDto, userId: string): Promise<CatEntity> {
    const breed = await this.breedService.findOne(cat.breedId);

    // const { seed } = breed;
    // const colorObservable = this.client.send<string, string>('generate_color', seed);
    // const color = await firstValueFrom(colorObservable);

    const color = '11BB22';

    const newCat = this.catRepository.create({ ...cat, color });
    newCat.user = await this.userService.findOne(userId);
    const createdCat = await this.catRepository.save(newCat);

    this.eventEmitter.emit('data.crud', {
      action: 'create',
      model: 'cat',
      cat: createdCat,
    });

    return createdCat;
  }

  async update(
    id: string,
    cat: UpdateCatDto,
    userId: string,
  ): Promise<CatEntity> {
    const existingCat = await this.catRepository.findOne({
      where: {
        id: id,
        userId: userId,
      },
      relations: ['breed'],
    });
    if (!existingCat) {
      throw new NotFoundException('Cat not found');
    }
    await this.catRepository.update(existingCat.id, cat);
    const updatedCat = await this.findOne(id);
    this.eventEmitter.emit('data.crud', {
      action: 'update',
      model: 'cat',
      cat: updatedCat,
    });
    return updatedCat;
  }

  public async crossbreed(
    cat: CreateCrossbreedCatDto,
    userId: string,
  ): Promise<CatEntity> {
    const breed1 = await this.breedService.findOne(cat.breedId1);
    const breed2 = await this.breedService.findOne(cat.breedId2);

    let newBreedId: string;

    if (breed1.id === breed2.id) {
      newBreedId = breed1.id;
    } else {
      const newBreed = await this.breedService.create({
        name: `${breed1.name} x ${breed2.name}`,
        description: 'Crossbreed',
      });
      newBreedId = newBreed.id;
    }

    const newCat = this.catRepository.create({
      name: `${breed1.name} x ${breed2.name}`,
      userId: userId,
      breedId: newBreedId,
      color: '11BB22',
      age: cat.age,
    });

    await this.catRepository.save(newCat);

    return await this.findOne(newCat.id, true);
  }
}
