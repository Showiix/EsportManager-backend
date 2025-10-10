#!/bin/bash

# 数据库初始化脚本

echo "Initializing database for Esports Simulator..."

# 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

echo "Database initialization completed!"