"use client";
import React, { useEffect, useState } from 'react';

const StaffList = () => {
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const response = await fetch('/api/staff/list');
        const data = await response.json();
        if (data.success) {
          setStaff(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch staff list:', error);
      }
    };

    fetchStaff();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Staff List</h1>
      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr>
            <th className="border border-gray-300 px-4 py-2">ID</th>
            <th className="border border-gray-300 px-4 py-2">Name</th>
            <th className="border border-gray-300 px-4 py-2">Staff No</th>
            <th className="border border-gray-300 px-4 py-2">Position</th>
            <th className="border border-gray-300 px-4 py-2">Contact</th>
            <th className="border border-gray-300 px-4 py-2">Hire Date</th>
            <th className="border border-gray-300 px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member, index) => (
            <tr key={index}>
              <td className="border border-gray-300 px-4 py-2">{member.id}</td>
              <td className="border border-gray-300 px-4 py-2">{member.first_name} {member.last_name}</td>
              <td className="border border-gray-300 px-4 py-2">{member.staff_no}</td>
              <td className="border border-gray-300 px-4 py-2">{member.position}</td>
              <td className="border border-gray-300 px-4 py-2">{member.phone}</td>
              <td className="border border-gray-300 px-4 py-2">{member.hire_date}</td>
              <td className="border border-gray-300 px-4 py-2">{member.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default StaffList;