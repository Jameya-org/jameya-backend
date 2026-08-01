# Elastic IP for NAT Gateway
resource "aws_eip" "eip_NAT_1" {
  domain = "vpc"
  tags = {
    Name = "${var.project_name}-eip-NAT"
  }
}

# Regional NAT Gateway placed in Public Subnet 2
resource "aws_nat_gateway" "regional_nat" {
  allocation_id = aws_eip.eip_NAT_1.id
  subnet_id     = var.public_sub_2_id

  tags = {
    Name = "${var.project_name}-regional-nat"
  }

  depends_on = [aws_eip.eip_NAT_1]
}

# Private route table 1
resource "aws_route_table" "private_rt_1a" {
  vpc_id = var.vpc_id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.regional_nat.id
  }

  tags = {
    Name = "${var.project_name}-private-rt-1a"
  }
}

# Private route table 2
resource "aws_route_table" "private_rt_2a" {
  vpc_id = var.vpc_id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.regional_nat.id
  }

  tags = {
    Name = "${var.project_name}-private-rt-2a"
  }
}

# Associate private subnets with route tables
resource "aws_route_table_association" "private_rt_association_1a" {
  subnet_id      = var.private_sub_1a_id
  route_table_id = aws_route_table.private_rt_1a.id
}

resource "aws_route_table_association" "private_rt_association_2a" {
  subnet_id      = var.private_sub_2a_id
  route_table_id = aws_route_table.private_rt_2a.id
}
