#Fetch available AZs
data "aws_availability_zones" "available" {
  state = "available"
}
#creating VPC
resource "aws_vpc" "main_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}
#creating internet gateway
resource "aws_internet_gateway" "main_igw" {
  vpc_id = aws_vpc.main_vpc.id

  tags = {
    Name = "${var.project_name}-igw"
  }
}
#creating public subnets
resource "aws_subnet" "public_sub_1" {
  vpc_id                  = aws_vpc.main_vpc.id
  cidr_block              = var.public_sub_1_cidr
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-sub-1"
  }
}

resource "aws_subnet" "public_sub_2" {
  vpc_id                  = aws_vpc.main_vpc.id
  cidr_block              = var.public_sub_2_cidr
  availability_zone       = data.aws_availability_zones.available.names[1]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-sub-2"
  }
}
#route table for public subnets
resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.main_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main_igw.id
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}
resource "aws_route_table_association" "public_rt_association_1" {
  subnet_id      = aws_subnet.public_sub_1.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table_association" "public_rt_association_2" {
  subnet_id      = aws_subnet.public_sub_2.id
  route_table_id = aws_route_table.public_rt.id
}
resource "aws_subnet" "private_sub_1a" {
  vpc_id            = aws_vpc.main_vpc.id
  cidr_block        = var.private_sub_1a_cidr
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = {
    Name = "${var.project_name}-private-sub-1a"
  }
}

resource "aws_subnet" "private_sub_2a" {
  vpc_id            = aws_vpc.main_vpc.id
  cidr_block        = var.private_sub_2a_cidr
  availability_zone = data.aws_availability_zones.available.names[1]

  tags = {
    Name = "${var.project_name}-private-sub-2a"
  }
}
