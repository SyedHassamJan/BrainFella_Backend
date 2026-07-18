import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { CompleteExerciseDto } from './dto/complete-exercise.dto';

@Injectable()
export class CbtService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(category?: string, difficulty?: string) {
    return this.prisma.cbtExercise.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
        ...(difficulty ? { difficulty } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(id: string) {
    const exercise = await this.prisma.cbtExercise.findUnique({
      where: { id },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');
    return exercise;
  }

  async create(dto: CreateExerciseDto) {
    return this.prisma.cbtExercise.create({ data: dto });
  }

  async complete(exerciseId: string, userId: string, dto: CompleteExerciseDto) {
    const exercise = await this.prisma.cbtExercise.findUnique({
      where: { id: exerciseId },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');

    const existing = await this.prisma.exerciseCompletion.findUnique({
      where: { userId_exerciseId: { userId, exerciseId } },
    });
    if (existing)
      throw new ConflictException('You have already completed this exercise');

    return this.prisma.exerciseCompletion.create({
      data: { userId, exerciseId, ...dto },
    });
  }

  async getMyCompletions(userId: string) {
    return this.prisma.exerciseCompletion.findMany({
      where: { userId },
      include: { exercise: true },
      orderBy: { completedAt: 'desc' },
    });
  }
}
