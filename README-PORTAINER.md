# Deploy Christmas Tree qua Portainer

## Cách 1: Dùng GitHub trực tiếp (Khuyên dùng)

### Bước 1: Tạo Dockerfile trên GitHub

Đảm bảo repo `https://github.com/moleculemmeng020425/christmas-tree.git` đã có file `Dockerfile` ở thư mục gốc.

### Bước 2: Tạo Stack trong Portainer

1. Mở Portainer: `http://your-server:9000`
2. Chọn **Stacks** -> **Add stack**
3. Điền thông tin:

| Field | Value |
|-------|-------|
| Name | `christmas-tree` |
| Editor | Paste nội dung bên dưới |

### Yêu cầu nội dung docker-compose.yml cho Portainer:

```yaml
version: '3.8'

services:
  christmas-tree:
    build:
      context: https://github.com/moleculemmeng020425/christmas-tree.git#main
      dockerfile: Dockerfile
    image: christmas-tree:latest
    container_name: christmas-tree-web
    ports:
      - "8080:8080"
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - TZ=Asia/Ho_Chi_Minh
```

4. Nhấn **Deploy the stack**
5. Chờ build hoàn thành (5-10 phút)
6. Truy cập: `http://your-server-ip:8080`

---

## Cách 2: Build Image trước, sau đó deploy

### Bước 1: Tạo Custom Image trong Portainer

1. Vào **Images** -> **Build a new image**
2. Điền thông tin:

| Field | Value |
|-------|-------|
| Image name | `christmas-tree:latest` |
| Dockerfile content | Copy nội dung Dockerfile bên dưới |

### Nội dung Dockerfile:

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Expose port
EXPOSE 8080

# Set environment to production
ENV NODE_ENV=production

# Run with Vite preview server
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "8080"]
```

3. Nhấn **Build the image**

### Bước 2: Tạo Stack sử dụng Image

1. Vào **Stacks** -> **Add stack**
2. Paste nội dung:

```yaml
version: '3.8'

services:
  christmas-tree:
    image: christmas-tree:latest
    container_name: christmas-tree-web
    ports:
      - "8080:8080"
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - TZ=Asia/Ho_Chi_Minh
```

3. Nhấn **Deploy the stack**

---

## Kiểm tra và Quản lý

| Hành động | Vị trí trong Portainer |
|-----------|------------------------|
| Xem logs | Containers -> christmas-tree-web -> Logs |
| Khởi động lại | Containers -> christmas-tree-web -> Restart |
| Dừng | Containers -> christmas-tree-web -> Stop |
| Xem console | Containers -> christmas-tree-web -> Console |

---

## Lưu ý

- **Port**: Mặc định 8080, có thể đổi thành port khác (ví dụ 3000:8080)
- **Timezone**: Đổi `TZ` theo múi giờ của bạn
- **Webcam**: Hoạt động trên trình duyệt client, không cần cấu hình Docker
