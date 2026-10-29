// Fixture con violaciones deliberadas de la regla de dependencias
import express from 'express';
import { placeholder } from '../application/use-case.ts';
import { internal } from '../../payments/domain/internal.ts';

export const broken = [express, placeholder, internal];
