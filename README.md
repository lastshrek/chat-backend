# Chat Backend

基于 NestJS 构建的实时聊天应用后端服务。

## 功能特性

### 用户系统
- 用户注册/登录
- JWT 认证
- 用户头像自动生成
- 组织架构管理

### 即时通讯
- WebSocket 实时消息
- 私聊/群聊支持
- 消息已读/未读状态
- 在线/离线状态
- 输入状态提示
- 支持文本、图片、文件等多种消息类型

### 群聊功能
- 创建/解散群聊
- 群成员管理
- 群角色权限（群主/管理员/成员）
- 群聊设置（名称/头像/描述）

### 好友系统
- 好友请求发送/处理
- 好友列表管理
- 好友在线状态同步

### 文档协作
- 实时协作编辑
- 文档历史记录
- 协作者权限管理
- 支持富文本和电子表格

## 技术栈

- NestJS - Node.js 服务端框架
- Prisma - ORM 和数据库迁移
- Socket.IO - WebSocket 实时通信
- Redis - 缓存和实时状态管理
- MySQL - 主数据库
- JWT - 用户认证
- MinIO - 文件存储

## 开发环境设置

1. 克隆项目

```bash
git clone https://github.com/lastshrek/chat-backend.git 
cd chat-backend
```

2. 安装依赖

```bash
npm install
```

3. 启动开发环境

```bash
npm run dev
```

4. 访问 API 文档

```bash
http://localhost:3000/api
```


