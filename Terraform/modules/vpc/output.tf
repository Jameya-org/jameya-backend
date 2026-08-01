output "vpc_id" {
  value = aws_vpc.main_vpc.id
}

output "public_sub_1_id" {
  value = aws_subnet.public_sub_1.id
}

output "public_sub_2_id" {
  value = aws_subnet.public_sub_2.id
}

output "private_sub_1a_id" {
  value = aws_subnet.private_sub_1a.id
}

output "private_sub_2a_id" {
  value = aws_subnet.private_sub_2a.id
}

output "igw_id" {
  value = aws_internet_gateway.main_igw.id
}
